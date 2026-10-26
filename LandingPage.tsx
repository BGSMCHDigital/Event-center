import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { FileText, Sparkles, CheckSquare, ArrowRight } from "lucide-react";

const features = [
{
  icon: FileText,
  title: "Structured Submission",
  description: "Submit event details through a clean, guided form. No more messy emails or incomplete reports."
},
{
  icon: Sparkles,
  title: "AI-Powered Writing",
  description: "Automatically generates professional news-style articles from your structured event data."
},
{
  icon: CheckSquare,
  title: "Editorial Workflow",
  description: "Built-in approval pipeline. Editors review, refine, and publish with confidence."
}];


export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            BGS MCH <span className="text-accent">EventReporter</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="container py-24 lg:py-32">
        <motion.div
          className="mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
          
          <p className="text-label mb-4">BGS MCH CAMPUS EVENT REPORTING</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            AI-Powered Event Reporting
            <br />
            <span className="font-editorial italic text-accent">System Simplified</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
            Submit your event details. Get a professionally written article in seconds. 
            Review, edit, and publish — all in one place.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Button variant="hero" asChild>
              <Link to="/submit">
                Submit an Event <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link to="/login">Editor Login</Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="border-t bg-card py-24">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <h2 className="text-3xl font-semibold tracking-tight">How it works</h2>
            <p className="mt-3 text-muted-foreground">Three steps from raw event data to published article.</p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
            {features.map((feature, i) =>
            <motion.div
              key={feature.title}
              className="rounded-lg border bg-background p-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 * i, ease: [0.16, 1, 0.3, 1] }}>
              
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </motion.div>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-24 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">Ready to streamline your event reporting?</h2>
        <p className="mt-3 text-muted-foreground">Start submitting events today. </p>
        <Button variant="hero" className="mt-8" asChild>
          <Link to="/submit">Submit an Event <ArrowRight className="ml-1 h-4 w-4" /></Link>
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} BGS MCH EventReporter. Built for BGS Medical College and Hospital campus newsrooms.
        </div>
      </footer>
    </div>);

}